import { CacheInvalidationTrait } from './cache-invalidation-trait';

import type { QueryCacheOptions } from '../cache-strategy';

export class CacheMaintenanceTrait extends CacheInvalidationTrait {
  private cleanupInterval?: NodeJS.Timeout;

  async warmUp(
    queries: Array<{ sql: string; params?: unknown[]; options?: QueryCacheOptions }>,
  ): Promise<void> {
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

  startCleanupTimer(intervalMs = 60_000): void {
    this.stopCleanupTimer();

    this.cleanupInterval = setInterval(() => {
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
    }, intervalMs);
  }

  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  destroy(): void {
    this.stopCleanupTimer();
    this.queryCache.clear();
    this.tagIndex.clear();
    this.removeAllListeners();
  }
}

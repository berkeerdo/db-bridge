import { CacheOperationsTrait } from './cache-operations-trait';

export class CacheInvalidationTrait extends CacheOperationsTrait {
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
}
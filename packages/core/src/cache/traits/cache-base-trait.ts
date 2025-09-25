import { EventEmitter } from 'eventemitter3';
import { CacheAdapter } from '../../interfaces';
import { Logger } from '../../types';

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

export class CacheBaseTrait extends EventEmitter {
  protected cache: CacheAdapter;
  protected logger?: Logger;
  protected enabled = true;
  protected statistics: CacheStatistics;

  constructor(cache: CacheAdapter, logger?: Logger, enabled = true) {
    super();
    this.cache = cache;
    this.logger = logger;
    this.enabled = enabled;
    
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

  protected updateStatistics(type: 'hit' | 'miss', duration: number): void {
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
}
import { DefaultCacheStrategy } from './cache-strategy';
import { CacheMaintenanceTrait } from './traits/cache-maintenance-trait';

import type { CacheStrategy } from './cache-strategy';
import type { CacheAdapter } from '../interfaces';
import type { Logger } from '../types';

export * from './cache-strategy';
export * from './traits/cache-base-trait';
export * from './traits/cache-operations-trait';

/**
 * Modular Cache Manager
 * Refactored from 533 lines, 50 methods to modular traits
 */
export class ModularCacheManager extends CacheMaintenanceTrait {
  constructor(
    cache: CacheAdapter,
    options: {
      strategy?: CacheStrategy;
      logger?: Logger;
      enabled?: boolean;
    } = {},
  ) {
    super(cache, options.logger, options.enabled ?? true);
    this.strategy = options.strategy || new DefaultCacheStrategy();
    this.startCleanupTimer();
  }
}

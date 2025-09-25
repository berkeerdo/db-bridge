import { DatabaseAdapter } from '../interfaces';
import { AdapterWrapperTrait } from './traits/adapter-wrapper-trait';

export * from './traits/trace-base-trait';
export * from './traits/query-analysis-trait';
export * from './traits/performance-analysis-trait';

/**
 * Modular Performance Monitor
 * Refactored from 394 lines, 32 methods to modular traits
 */
export class ModularPerformanceMonitor extends AdapterWrapperTrait {
  constructor(
    adapter: DatabaseAdapter,
    options: {
      slowQueryThreshold?: number;
      maxTraces?: number;
      enabled?: boolean;
    } = {}
  ) {
    super(
      adapter,
      options.slowQueryThreshold ?? 1000,
      options.maxTraces ?? 10000,
      options.enabled ?? true
    );
  }
}
export * from './types';
export * from './constants';
export * from './interfaces';
export * from './errors';
export * from './utils';
export * from './base-adapter';
export * from './base-query-builder';
export * from './query-builder';
export * from './health';
export * from './migrations';
export * from './schema';
export * from './seeds';
export * from './monitoring/performance-monitor';
export { ModularPerformanceMonitor } from './monitoring/modular-performance-monitor';
export * from './cache';
export * from './crypto/crypto';

// New modular architecture exports
export * from './dialect';
export * from './query';
export * from './transaction';
export * from './middleware';

// Legacy exports (for backward compatibility)
export type { ClientOptions } from './client';
export { DBBridge as Client } from './client';

// Modern API exports
export { DBBridge } from './db-bridge';
export type { DBBridgeConfig, DatabaseType } from './db-bridge';

// Cached API exports (Industry-leading cache integration)
export { CachedDBBridge, CacheableQuery } from './db-bridge-cached';
export type { CachedDBBridgeConfig } from './db-bridge-cached';

// Export factory pattern version
export {
  DBBridge as DBBridgeFactory,
  registerAdapterFactory,
  createAdapter,
} from './db-bridge-factory';
export type { AdapterFactory } from './db-bridge-factory';

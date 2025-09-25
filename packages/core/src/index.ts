export * from './types';
export * from './interfaces';
export * from './errors';
export * from './utils';
export * from './base-adapter';
export * from './base-query-builder';
export * from './health';
export * from './migrations/migration-runner';
export * from './monitoring/performance-monitor';
export { 
  ModularPerformanceMonitor 
} from './monitoring/modular-performance-monitor';
export * from './cache';
export * from './crypto/crypto';

// Legacy exports (for backward compatibility)
export type { ClientOptions } from './client';
export { DBBridge as Client } from './client';

// Modern API exports
export { DBBridge } from './db-bridge';
export type { DBBridgeConfig, DatabaseType } from './db-bridge';

// Export factory pattern version
export { 
  DBBridge as DBBridgeFactory, 
  registerAdapterFactory, 
  createAdapter 
} from './db-bridge-factory';
export type { AdapterFactory } from './db-bridge-factory';
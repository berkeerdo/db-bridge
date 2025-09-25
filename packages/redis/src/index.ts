// Legacy exports (for backward compatibility)
export { RedisAdapter } from './adapter/redis-adapter';
export type { RedisAdapterOptions } from './adapter/redis-adapter';
export { RedisCacheAdapter, createDatabaseAdapterWithCache } from './adapter/redis-cache-adapter';
export type { RedisCacheAdapterOptions } from './adapter/redis-cache-adapter';
export { RedisCommands } from './commands/redis-commands';

// New modular exports
export { ModularRedisAdapter } from './adapter/modular-redis-adapter';
export { ModularRedisStreamManager } from './streams/modular-stream-manager';
export type { 
  StreamEntry,
  StreamInfo,
  ConsumerGroupInfo
} from './streams/modular-stream-manager';

// Re-export core interfaces
export type { 
  CacheAdapter,
  ConnectionConfig,
  DatabaseAdapter
} from '@db-bridge/core';
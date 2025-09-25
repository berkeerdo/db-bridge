import { registerAdapterFactory, type DBBridgeConfig } from '@db-bridge/core';
import { RedisAdapter } from './adapter/redis-adapter';

// Auto-register Redis adapter factory
registerAdapterFactory('redis', {
  createAdapter(config: DBBridgeConfig) {
    return new RedisAdapter(config.options?.logger ? {
      logger: config.options.logger
    } : {});
  }
});

export { RedisAdapter };
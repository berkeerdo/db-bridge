import { registerAdapterFactory, type DBBridgeConfig } from '@db-bridge/core';
import { MySQLAdapter } from './adapter/mysql-adapter';

// Auto-register MySQL adapter factory
registerAdapterFactory('mysql', {
  createAdapter(config: DBBridgeConfig) {
    return new MySQLAdapter(config.options?.logger ? {
      logger: config.options.logger
    } : {});
  }
});

export { MySQLAdapter };
import { registerAdapterFactory, type DBBridgeConfig } from '@db-bridge/core';
import { PostgreSQLAdapter } from './adapter/postgresql-adapter';

// Auto-register PostgreSQL adapter factory
registerAdapterFactory('postgresql', {
  createAdapter(config: DBBridgeConfig) {
    return new PostgreSQLAdapter(config.options?.logger ? {
      logger: config.options.logger
    } : {});
  }
});

registerAdapterFactory('postgres', {
  createAdapter(config: DBBridgeConfig) {
    return new PostgreSQLAdapter(config.options?.logger ? {
      logger: config.options.logger
    } : {});
  }
});

export { PostgreSQLAdapter };
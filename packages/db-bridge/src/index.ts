/**
 * DB Bridge - All-in-one package
 * 
 * This package includes all database adapters for convenience.
 * Users can install this single package to get everything:
 * 
 * ```bash
 * npm install db-bridge
 * ```
 * 
 * Or install individual packages for smaller bundle size:
 * 
 * ```bash
 * npm install @db-bridge/core @db-bridge/mysql
 * npm install @db-bridge/core @db-bridge/redis
 * npm install @db-bridge/core @db-bridge/postgresql
 * ```
 */

// Re-export everything from core
export * from '@db-bridge/core';
export { DBBridge } from '@db-bridge/core';

// Re-export all adapters
export { MySQLAdapter } from '@db-bridge/mysql';
export type { MySQLAdapterOptions } from '@db-bridge/mysql';

export { PostgreSQLAdapter } from '@db-bridge/postgresql';
export type { PostgreSQLAdapterOptions } from '@db-bridge/postgresql';

export { RedisAdapter } from '@db-bridge/redis';
export type { RedisAdapterOptions } from '@db-bridge/redis';

// Convenience default export
import { DBBridge } from '@db-bridge/core';
export default DBBridge;
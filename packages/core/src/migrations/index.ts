/**
 * Migration Module
 * Database migration system for db-bridge
 */

// Legacy migration runner (backward compatibility)
export {
  MigrationRunner,
  type Migration as LegacyMigration,
  type MigrationHistory,
  type MigrationRunnerOptions,
} from './migration-runner';

// New file-based migration system
export { FileMigrationRunner } from './FileMigrationRunner';
export type { FileMigrationRunnerOptions } from './FileMigrationRunner';

export { MigrationLoader } from './MigrationLoader';
export { MigrationLock } from './MigrationLock';
export type { MigrationLockOptions } from './MigrationLock';

export type {
  Migration,
  MigrationFile,
  MigrationRecord,
  MigrationStatus,
  MigrationConfig,
  MigrationLock as MigrationLockRecord,
  BatchInfo,
} from './types';

// Expand/Contract pattern helpers
export {
  ExpandContractHelper,
  createExpandContractHelper,
  type ExpandContractMigration,
  type Phase,
} from './ExpandContract';

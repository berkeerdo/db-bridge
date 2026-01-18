/**
 * Migration Types
 * Type definitions for the migration system
 */

import type { SchemaBuilder } from '../schema';

/**
 * Migration file interface
 */
export interface MigrationFile {
  /** Migration name (derived from filename) */
  name: string;
  /** Full file path */
  path: string;
  /** Timestamp from filename (e.g., 20250118120000) */
  timestamp: string;
  /** Migration description (from filename after timestamp) */
  description: string;
  /** Optional prefix (e.g., 'auth' from auth_20250118_xxx.ts) */
  prefix?: string;
}

/**
 * Migration definition interface
 */
export interface Migration {
  /** Unique migration name */
  name: string;
  /** Run the migration */
  up: (schema: SchemaBuilder) => Promise<void>;
  /** Reverse the migration */
  down: (schema: SchemaBuilder) => Promise<void>;
  /** Whether to run in a transaction (default: true) */
  transactional?: boolean;
  /** Migration phase for expand/contract pattern */
  phase?: 'expand' | 'migrate' | 'contract';
}

/**
 * Migration record stored in database
 */
export interface MigrationRecord {
  id: number;
  name: string;
  batch: number;
  executed_at: Date;
  execution_time_ms: number;
  checksum: string;
}

/**
 * Migration status
 */
export interface MigrationStatus {
  name: string;
  batch: number | null;
  executedAt: Date | null;
  pending: boolean;
}

/**
 * Migration runner configuration
 */
export interface MigrationConfig {
  /** Directory containing migration files */
  directory: string;
  /** Migration table name (default: 'db_migrations') */
  tableName?: string;
  /** Lock table name (default: 'db_migrations_lock') */
  lockTableName?: string;
  /** Lock timeout in milliseconds (default: 60000) */
  lockTimeout?: number;
  /** Whether to validate checksums (default: true) */
  validateChecksums?: boolean;
  /** Database dialect */
  dialect: 'mysql' | 'postgresql';
}

/**
 * Migration lock record
 */
export interface MigrationLock {
  id: number;
  is_locked: boolean;
  locked_at: Date | null;
  locked_by: string | null;
}

/**
 * Batch info for rollback
 */
export interface BatchInfo {
  batch: number;
  migrations: MigrationRecord[];
}

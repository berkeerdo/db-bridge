/**
 * File Migration Runner
 * Enhanced migration runner with file-based loading, batch tracking, and locks
 */

import { createHash } from 'node:crypto';

import { MigrationLoader } from './MigrationLoader';
import { MigrationLock } from './MigrationLock';
import { SchemaBuilder } from '../schema';

import type { DatabaseAdapter } from '../interfaces';
import type { Logger } from '../types';
import type {
  Migration,
  MigrationConfig,
  MigrationRecord,
  MigrationStatus,
  BatchInfo,
} from './types';

export interface FileMigrationRunnerOptions extends MigrationConfig {
  logger?: Logger;
  dryRun?: boolean;
}

export class FileMigrationRunner {
  private adapter: DatabaseAdapter;
  private loader: MigrationLoader;
  private lock: MigrationLock;
  private schema: SchemaBuilder;
  private options: Required<Omit<FileMigrationRunnerOptions, 'logger'>> & {
    logger: Logger;
  };

  constructor(adapter: DatabaseAdapter, options: FileMigrationRunnerOptions) {
    this.adapter = adapter;
    this.options = {
      directory: options.directory,
      tableName: options.tableName ?? 'db_migrations',
      lockTableName: options.lockTableName ?? 'db_migrations_lock',
      lockTimeout: options.lockTimeout ?? 60000,
      validateChecksums: options.validateChecksums ?? true,
      dialect: options.dialect,
      logger: options.logger ?? console,
      dryRun: options.dryRun ?? false,
    };

    this.loader = new MigrationLoader(options.directory);
    this.lock = new MigrationLock(adapter, {
      tableName: this.options.lockTableName,
      timeout: this.options.lockTimeout,
      dialect: options.dialect,
    });
    this.schema = new SchemaBuilder({
      dialect: options.dialect,
      adapter,
    });
  }

  /**
   * Initialize migration tables
   */
  async initialize(): Promise<void> {
    if (this.options.dryRun) {
      this.options.logger.info('DRY RUN: Would create migration tables');
      return;
    }

    // Create migrations table
    const tableName = this.options.tableName;
    const hasTable = await this.schema.hasTable(tableName);

    if (!hasTable) {
      await this.schema.createTable(tableName, (table) => {
        table.increments('id');
        table.string('name', 255).notNull().unique();
        table.integer('batch').notNull();
        table.timestamp('executed_at').notNull().defaultNow();
        table.integer('execution_time_ms').notNull();
        table.string('checksum', 64).notNull();
        table.index('batch');
        table.index('executed_at');
      });
      this.options.logger.info(`Created migrations table: ${tableName}`);
    }

    // Initialize lock table
    await this.lock.initialize();
  }

  /**
   * Run all pending migrations
   */
  async latest(): Promise<string[]> {
    // Initialize lock table before trying to acquire lock
    await this.lock.initialize();

    return this.lock.withLock(async () => {
      await this.initialize();

      const pending = await this.getPendingMigrations();
      if (pending.length === 0) {
        this.options.logger.info('No pending migrations');
        return [];
      }

      const batch = await this.getNextBatch();
      const executed: string[] = [];

      this.options.logger.info(`Running ${pending.length} migrations (batch ${batch})`);

      for (const migration of pending) {
        await this.runMigration(migration, 'up', batch);
        executed.push(migration.name);
      }

      return executed;
    });
  }

  /**
   * Rollback the last batch of migrations
   */
  async rollback(steps: number = 1): Promise<string[]> {
    await this.lock.initialize();

    return this.lock.withLock(async () => {
      await this.initialize();

      const batches = await this.getLastBatches(steps);
      if (batches.length === 0) {
        this.options.logger.info('No migrations to rollback');
        return [];
      }

      const rolledBack: string[] = [];

      for (const batch of batches) {
        this.options.logger.info(`Rolling back batch ${batch.batch}`);

        // Rollback in reverse order
        const migrations = await this.loadMigrationsByName(
          batch.migrations.map((m) => m.name).reverse(),
        );

        for (const migration of migrations) {
          await this.runMigration(migration, 'down', batch.batch);
          rolledBack.push(migration.name);
        }
      }

      return rolledBack;
    });
  }

  /**
   * Reset all migrations
   */
  async reset(): Promise<string[]> {
    await this.lock.initialize();

    return this.lock.withLock(async () => {
      await this.initialize();

      const executed = await this.getExecutedMigrations();
      if (executed.length === 0) {
        this.options.logger.info('No migrations to reset');
        return [];
      }

      const rolledBack: string[] = [];

      // Rollback all in reverse order
      const migrations = await this.loadMigrationsByName(executed.map((m) => m.name).reverse());

      for (const migration of migrations) {
        const record = executed.find((e) => e.name === migration.name)!;
        await this.runMigration(migration, 'down', record.batch);
        rolledBack.push(migration.name);
      }

      return rolledBack;
    });
  }

  /**
   * Reset and re-run all migrations
   */
  async fresh(): Promise<string[]> {
    await this.reset();
    return this.latest();
  }

  /**
   * Get migration status
   */
  async status(): Promise<MigrationStatus[]> {
    await this.initialize();

    const allMigrations = await this.loader.getMigrationFiles();
    const executed = await this.getExecutedMigrations();
    const executedMap = new Map(executed.map((e) => [e.name, e]));

    return allMigrations.map((file) => {
      const record = executedMap.get(file.name);
      return {
        name: file.name,
        batch: record?.batch ?? null,
        executedAt: record?.executed_at ?? null,
        pending: !record,
      };
    });
  }

  /**
   * Validate migrations
   */
  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const migrations = await this.loader.loadAll();
      const executed = await this.getExecutedMigrations();

      // Check for missing migrations in codebase
      for (const record of executed) {
        const migration = migrations.find((m) => m.name === record.name);
        if (!migration) {
          errors.push(`Migration '${record.name}' exists in database but not in codebase`);
          continue;
        }

        // Validate checksum
        if (this.options.validateChecksums) {
          const checksum = this.calculateChecksum(migration);
          if (checksum !== record.checksum) {
            errors.push(
              `Checksum mismatch for migration '${record.name}'. The migration may have been modified.`,
            );
          }
        }
      }
    } catch (error) {
      errors.push(`Validation error: ${(error as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const allMigrations = await this.loader.loadAll();
    const executed = await this.getExecutedMigrations();
    const executedNames = new Set(executed.map((e) => e.name));

    return allMigrations.filter((m) => !executedNames.has(m.name));
  }

  /**
   * Get executed migrations from database
   */
  private async getExecutedMigrations(): Promise<MigrationRecord[]> {
    const result = await this.adapter.query<MigrationRecord>(
      `SELECT * FROM ${this.options.tableName} ORDER BY id ASC`,
    );
    return result.rows;
  }

  /**
   * Get the next batch number
   */
  private async getNextBatch(): Promise<number> {
    const result = await this.adapter.query<{ max_batch: number | null }>(
      `SELECT MAX(batch) as max_batch FROM ${this.options.tableName}`,
    );
    return (result.rows[0]?.max_batch ?? 0) + 1;
  }

  /**
   * Get the last N batches
   */
  private async getLastBatches(count: number): Promise<BatchInfo[]> {
    const result = await this.adapter.query<MigrationRecord>(
      `SELECT * FROM ${this.options.tableName} ORDER BY batch DESC, id DESC`,
    );

    const batches = new Map<number, MigrationRecord[]>();
    for (const record of result.rows) {
      if (!batches.has(record.batch)) {
        batches.set(record.batch, []);
      }
      batches.get(record.batch)!.push(record);
    }

    const batchNumbers = Array.from(batches.keys()).slice(0, count);
    return batchNumbers.map((batch) => ({
      batch,
      migrations: batches.get(batch)!,
    }));
  }

  /**
   * Load migrations by name
   */
  private async loadMigrationsByName(names: string[]): Promise<Migration[]> {
    const allMigrations = await this.loader.loadAll();
    const migrationMap = new Map(allMigrations.map((m) => [m.name, m]));

    return names
      .map((name) => migrationMap.get(name))
      .filter((m): m is Migration => m !== undefined);
  }

  /**
   * Run a single migration
   */
  private async runMigration(
    migration: Migration,
    direction: 'up' | 'down',
    batch: number,
  ): Promise<void> {
    const startTime = Date.now();
    const action = direction === 'up' ? 'Running' : 'Rolling back';

    this.options.logger.info(`${action}: ${migration.name}`);

    if (this.options.dryRun) {
      this.options.logger.info(`DRY RUN: Would ${direction} ${migration.name}`);
      return;
    }

    const transaction = migration.transactional ? await this.adapter.beginTransaction() : null;

    try {
      // Create schema builder with transaction if applicable
      const schema = new SchemaBuilder({
        dialect: this.options.dialect,
        adapter: this.adapter,
      });

      // Run migration
      await migration[direction](schema);

      const executionTime = Date.now() - startTime;

      // Update migration record
      if (direction === 'up') {
        const checksum = this.calculateChecksum(migration);
        await this.adapter.execute(
          `INSERT INTO ${this.options.tableName}
           (name, batch, executed_at, execution_time_ms, checksum)
           VALUES (?, ?, NOW(), ?, ?)`,
          [migration.name, batch, executionTime, checksum],
        );
      } else {
        await this.adapter.execute(`DELETE FROM ${this.options.tableName} WHERE name = ?`, [
          migration.name,
        ]);
      }

      if (transaction) {
        await transaction.commit();
      }

      this.options.logger.info(
        `${direction === 'up' ? 'Completed' : 'Rolled back'}: ${migration.name} (${executionTime}ms)`,
      );
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      throw new Error(
        `Failed to ${direction} migration '${migration.name}': ${(error as Error).message}`,
      );
    }
  }

  /**
   * Calculate migration checksum
   */
  private calculateChecksum(migration: Migration): string {
    const content = `${migration.name}:${migration.up.toString()}:${migration.down.toString()}`;
    return createHash('sha256').update(content).digest('hex');
  }
}

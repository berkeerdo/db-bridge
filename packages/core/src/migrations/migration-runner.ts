import { QueryError } from '../errors';

import type { DatabaseAdapter } from '../interfaces';
import type { Logger } from '../types';

export interface Migration {
  id: string;
  version: number;
  name: string;
  up: (adapter: DatabaseAdapter) => Promise<void>;
  down: (adapter: DatabaseAdapter) => Promise<void>;
  timestamp: Date;
}

export interface MigrationHistory {
  id: string;
  version: number;
  name: string;
  executedAt: Date;
  duration: number;
  checksum: string;
}

export interface MigrationRunnerOptions {
  tableName?: string;
  logger?: Logger;
  validateChecksums?: boolean;
  dryRun?: boolean;
}

export class MigrationRunner {
  private adapter: DatabaseAdapter;
  private migrations: Migration[] = [];
  private options: Required<MigrationRunnerOptions>;

  constructor(adapter: DatabaseAdapter, options: MigrationRunnerOptions = {}) {
    this.adapter = adapter;
    this.options = {
      tableName: options.tableName ?? 'db_migrations',
      logger: options.logger ?? console,
      validateChecksums: options.validateChecksums ?? true,
      dryRun: options.dryRun ?? false,
    };
  }

  async initialize(): Promise<void> {
    if (this.options.dryRun) {
      this.options.logger.info('DRY RUN: Would create migrations table');
      return;
    }

    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.options.tableName} (
        id VARCHAR(255) PRIMARY KEY,
        version INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP NOT NULL,
        duration INT NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        INDEX idx_version (version),
        INDEX idx_executed_at (executed_at)
      )
    `;

    try {
      await this.adapter.execute(sql);
      this.options.logger.info(`Migrations table '${this.options.tableName}' ready`);
    } catch (error) {
      throw new QueryError(`Failed to create migrations table: ${(error as Error).message}`);
    }
  }

  addMigration(migration: Migration): void {
    // Check for duplicate versions
    const existing = this.migrations.find((m) => m.version === migration.version);
    if (existing) {
      throw new Error(
        `Migration version ${migration.version} already exists: ${existing.name} and ${migration.name}`,
      );
    }

    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  addMigrations(migrations: Migration[]): void {
    migrations.forEach((migration) => this.addMigration(migration));
  }

  async getExecutedMigrations(): Promise<MigrationHistory[]> {
    const result = await this.adapter.query<MigrationHistory>(
      `SELECT * FROM ${this.options.tableName} ORDER BY version ASC`,
    );

    return result.rows.map((row) => ({
      ...row,
      executedAt: new Date(row.executedAt),
    }));
  }

  async getPendingMigrations(): Promise<Migration[]> {
    const executed = await this.getExecutedMigrations();
    const executedVersions = new Set(executed.map((m) => m.version));

    return this.migrations.filter((m) => !executedVersions.has(m.version));
  }

  private calculateChecksum(migration: Migration): string {
    const crypto = require('node:crypto');
    const content = `${migration.id}:${migration.version}:${migration.name}:${migration.up.toString()}:${migration.down.toString()}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async up(targetVersion?: number): Promise<void> {
    await this.initialize();

    const pending = await this.getPendingMigrations();
    const toRun = targetVersion ? pending.filter((m) => m.version <= targetVersion) : pending;

    if (toRun.length === 0) {
      this.options.logger.info('No pending migrations to run');
      return;
    }

    this.options.logger.info(`Found ${toRun.length} pending migrations`);

    for (const migration of toRun) {
      await this.runMigration(migration, 'up');
    }
  }

  async down(targetVersion: number): Promise<void> {
    await this.initialize();

    const executed = await this.getExecutedMigrations();
    const toRevert = executed.filter((m) => m.version > targetVersion).reverse(); // Revert in reverse order

    if (toRevert.length === 0) {
      this.options.logger.info('No migrations to revert');
      return;
    }

    this.options.logger.info(`Found ${toRevert.length} migrations to revert`);

    for (const history of toRevert) {
      const migration = this.migrations.find((m) => m.version === history.version);
      if (!migration) {
        throw new Error(`Migration ${history.version} not found in codebase`);
      }

      await this.runMigration(migration, 'down');
    }
  }

  async latest(): Promise<void> {
    await this.up();
  }

  async rollback(steps = 1): Promise<void> {
    const executed = await this.getExecutedMigrations();

    if (executed.length === 0) {
      this.options.logger.info('No migrations to rollback');
      return;
    }

    const targetIndex = Math.max(0, executed.length - steps - 1);
    const targetVersion = targetIndex >= 0 ? executed[targetIndex]!.version : 0;

    await this.down(targetVersion);
  }

  async reset(): Promise<void> {
    await this.down(0);
  }

  async refresh(): Promise<void> {
    await this.reset();
    await this.latest();
  }

  private async runMigration(migration: Migration, direction: 'up' | 'down'): Promise<void> {
    const start = Date.now();
    const checksum = this.calculateChecksum(migration);

    this.options.logger.info(
      `${direction === 'up' ? 'Running' : 'Reverting'} migration ${migration.version}: ${migration.name}`,
    );

    if (this.options.dryRun) {
      this.options.logger.info(`DRY RUN: Would ${direction} migration ${migration.version}`);
      return;
    }

    const transaction = await this.adapter.beginTransaction();

    try {
      // Validate checksum if going down
      if (direction === 'down' && this.options.validateChecksums) {
        const history = await this.adapter.query<MigrationHistory>(
          `SELECT checksum FROM ${this.options.tableName} WHERE version = ?`,
          [migration.version],
        );

        if (history.rows[0]?.checksum !== checksum) {
          throw new Error(
            `Checksum mismatch for migration ${migration.version}. The migration may have been modified.`,
          );
        }
      }

      // Run the migration
      await migration[direction](this.adapter);

      // Update history
      if (direction === 'up') {
        await this.adapter.execute(
          `INSERT INTO ${this.options.tableName} (id, version, name, executed_at, duration, checksum) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            migration.id,
            migration.version,
            migration.name,
            new Date(),
            Date.now() - start,
            checksum,
          ],
          { transaction },
        );
      } else {
        await this.adapter.execute(
          `DELETE FROM ${this.options.tableName} WHERE version = ?`,
          [migration.version],
          { transaction },
        );
      }

      await transaction.commit();

      this.options.logger.info(
        `${direction === 'up' ? 'Completed' : 'Reverted'} migration ${migration.version} in ${Date.now() - start}ms`,
      );
    } catch (error) {
      await transaction.rollback();

      const action = direction === 'up' ? 'run' : 'revert';
      throw new Error(
        `Failed to ${action} migration ${migration.version}: ${(error as Error).message}`,
      );
    }
  }

  async status(): Promise<{
    executed: MigrationHistory[];
    pending: Migration[];
    current: number | null;
  }> {
    const executed = await this.getExecutedMigrations();
    const pending = await this.getPendingMigrations();
    const current = executed.length > 0 ? executed.at(-1)!.version : null;

    return { executed, pending, current };
  }

  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check for duplicate versions
    const versions = new Set<number>();
    for (const migration of this.migrations) {
      if (versions.has(migration.version)) {
        errors.push(`Duplicate migration version: ${migration.version}`);
      }
      versions.add(migration.version);
    }

    // Check for gaps in versions
    const sortedVersions = Array.from(versions).sort((a, b) => a - b);
    for (let i = 1; i < sortedVersions.length; i++) {
      if (sortedVersions[i]! - sortedVersions[i - 1]! > 1) {
        errors.push(
          `Gap in migration versions between ${sortedVersions[i - 1]} and ${sortedVersions[i]}`,
        );
      }
    }

    // Validate checksums of executed migrations
    if (this.options.validateChecksums) {
      const executed = await this.getExecutedMigrations();

      for (const history of executed) {
        const migration = this.migrations.find((m) => m.version === history.version);

        if (!migration) {
          errors.push(`Migration ${history.version} exists in history but not in codebase`);
          continue;
        }

        const currentChecksum = this.calculateChecksum(migration);
        if (currentChecksum !== history.checksum) {
          errors.push(
            `Checksum mismatch for migration ${history.version}: ${history.name}. The migration has been modified after execution.`,
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

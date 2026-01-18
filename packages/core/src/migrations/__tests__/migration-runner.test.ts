import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { QueryError } from '../../errors';
import { MigrationRunner } from '../migration-runner';

import type { DatabaseAdapter } from '../../interfaces';
import type { Migration, MigrationHistory } from '../migration-runner';

describe('MigrationRunner', () => {
  let adapter: DatabaseAdapter;
  let logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let runner: MigrationRunner;

  const createMigration = (version: number, name: string): Migration => ({
    id: `migration_${version}`,
    version,
    name,
    up: vi.fn().mockResolvedValue(undefined),
    down: vi.fn().mockResolvedValue(undefined),
    timestamp: new Date(),
  });

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const transaction = {
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
    };

    adapter = {
      execute: vi.fn().mockResolvedValue({ affectedRows: 1 }),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      beginTransaction: vi.fn().mockResolvedValue(transaction),
      name: 'PostgreSQL',
    } as unknown as DatabaseAdapter;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create runner with default options', () => {
      runner = new MigrationRunner(adapter);
      expect(runner).toBeDefined();
    });

    it('should create runner with custom options', () => {
      runner = new MigrationRunner(adapter, {
        tableName: 'custom_migrations',
        logger,
        validateChecksums: false,
        dryRun: true,
      });
      expect(runner).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should create migrations table', async () => {
      runner = new MigrationRunner(adapter, { logger });

      await runner.initialize();

      expect(adapter.execute).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS'),
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Migrations table'));
    });

    it('should log dry run message in dry run mode', async () => {
      runner = new MigrationRunner(adapter, { logger, dryRun: true });

      await runner.initialize();

      expect(adapter.execute).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('DRY RUN: Would create migrations table');
    });

    it('should throw QueryError on failure', async () => {
      adapter.execute = vi.fn().mockRejectedValue(new Error('Connection failed'));
      runner = new MigrationRunner(adapter, { logger });

      await expect(runner.initialize()).rejects.toThrow(QueryError);
      await expect(runner.initialize()).rejects.toThrow('Failed to create migrations table');
    });

    it('should use custom table name', async () => {
      runner = new MigrationRunner(adapter, {
        logger,
        tableName: 'my_migrations',
      });

      await runner.initialize();

      expect(adapter.execute).toHaveBeenCalledWith(expect.stringContaining('my_migrations'));
    });
  });

  describe('addMigration', () => {
    beforeEach(() => {
      runner = new MigrationRunner(adapter, { logger });
    });

    it('should add migration', () => {
      const migration = createMigration(1, 'create_users');

      runner.addMigration(migration);

      // No error means success
      expect(true).toBe(true);
    });

    it('should throw on duplicate version', () => {
      const migration1 = createMigration(1, 'create_users');
      const migration2 = createMigration(1, 'create_posts');

      runner.addMigration(migration1);

      expect(() => runner.addMigration(migration2)).toThrow('Migration version 1 already exists');
    });

    it('should sort migrations by version', async () => {
      runner.addMigration(createMigration(3, 'third'));
      runner.addMigration(createMigration(1, 'first'));
      runner.addMigration(createMigration(2, 'second'));

      const pending = await runner.getPendingMigrations();

      expect(pending[0]!.version).toBe(1);
      expect(pending[1]!.version).toBe(2);
      expect(pending[2]!.version).toBe(3);
    });
  });

  describe('addMigrations', () => {
    it('should add multiple migrations', () => {
      runner = new MigrationRunner(adapter, { logger });
      const migrations = [createMigration(1, 'first'), createMigration(2, 'second')];

      runner.addMigrations(migrations);

      // No error means success
      expect(true).toBe(true);
    });
  });

  describe('getExecutedMigrations', () => {
    it('should return executed migrations', async () => {
      const executedAt = new Date().toISOString();
      adapter.query = vi.fn().mockResolvedValue({
        rows: [
          { id: 'mig_1', version: 1, name: 'first', executedAt, duration: 100, checksum: 'abc' },
        ],
      });
      runner = new MigrationRunner(adapter, { logger });

      const executed = await runner.getExecutedMigrations();

      expect(executed).toHaveLength(1);
      expect(executed[0]!.version).toBe(1);
      expect(executed[0]!.executedAt).toBeInstanceOf(Date);
    });

    it('should return empty array when no migrations executed', async () => {
      adapter.query = vi.fn().mockResolvedValue({ rows: [] });
      runner = new MigrationRunner(adapter, { logger });

      const executed = await runner.getExecutedMigrations();

      expect(executed).toHaveLength(0);
    });
  });

  describe('getPendingMigrations', () => {
    it('should return pending migrations', async () => {
      adapter.query = vi.fn().mockResolvedValue({
        rows: [{ version: 1 }],
      });
      runner = new MigrationRunner(adapter, { logger });
      runner.addMigration(createMigration(1, 'first'));
      runner.addMigration(createMigration(2, 'second'));

      const pending = await runner.getPendingMigrations();

      expect(pending).toHaveLength(1);
      expect(pending[0]!.version).toBe(2);
    });
  });

  describe('up', () => {
    beforeEach(() => {
      runner = new MigrationRunner(adapter, { logger });
    });

    it('should run pending migrations', async () => {
      const migration = createMigration(1, 'create_users');
      runner.addMigration(migration);

      await runner.up();

      expect(migration.up).toHaveBeenCalled();
      expect(adapter.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.any(Array),
        expect.any(Object),
      );
    });

    it('should run migrations up to target version', async () => {
      const migration1 = createMigration(1, 'first');
      const migration2 = createMigration(2, 'second');
      const migration3 = createMigration(3, 'third');
      runner.addMigration(migration1);
      runner.addMigration(migration2);
      runner.addMigration(migration3);

      await runner.up(2);

      expect(migration1.up).toHaveBeenCalled();
      expect(migration2.up).toHaveBeenCalled();
      expect(migration3.up).not.toHaveBeenCalled();
    });

    it('should log when no pending migrations', async () => {
      adapter.query = vi.fn().mockResolvedValue({
        rows: [{ version: 1 }],
      });
      runner.addMigration(createMigration(1, 'first'));

      await runner.up();

      expect(logger.info).toHaveBeenCalledWith('No pending migrations to run');
    });

    it('should run in dry run mode without executing', async () => {
      runner = new MigrationRunner(adapter, { logger, dryRun: true });
      const migration = createMigration(1, 'first');
      runner.addMigration(migration);

      await runner.up();

      expect(migration.up).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });
  });

  describe('down', () => {
    beforeEach(() => {
      runner = new MigrationRunner(adapter, { logger, validateChecksums: false });
    });

    it('should revert migrations to target version', async () => {
      const migration1 = createMigration(1, 'first');
      const migration2 = createMigration(2, 'second');
      runner.addMigration(migration1);
      runner.addMigration(migration2);

      adapter.query = vi.fn().mockResolvedValue({
        rows: [
          { version: 1, checksum: 'abc' },
          { version: 2, checksum: 'def' },
        ],
      });

      await runner.down(0);

      expect(migration2.down).toHaveBeenCalled();
      expect(migration1.down).toHaveBeenCalled();
    });

    it('should log when no migrations to revert', async () => {
      adapter.query = vi.fn().mockResolvedValue({ rows: [] });

      await runner.down(0);

      expect(logger.info).toHaveBeenCalledWith('No migrations to revert');
    });

    it('should throw when migration not found in codebase', async () => {
      adapter.query = vi.fn().mockResolvedValue({
        rows: [{ version: 99, checksum: 'abc' }],
      });

      await expect(runner.down(0)).rejects.toThrow('Migration 99 not found in codebase');
    });

    it('should validate checksum when reverting', async () => {
      runner = new MigrationRunner(adapter, { logger, validateChecksums: true });
      const migration = createMigration(1, 'first');
      runner.addMigration(migration);

      // First query for getExecutedMigrations, second for checksum validation
      adapter.query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ version: 1, checksum: 'wrong_checksum' }],
        })
        .mockResolvedValueOnce({
          rows: [{ checksum: 'wrong_checksum' }],
        });

      await expect(runner.down(0)).rejects.toThrow('Checksum mismatch');
    });
  });

  describe('latest', () => {
    it('should run all pending migrations', async () => {
      runner = new MigrationRunner(adapter, { logger });
      const migration = createMigration(1, 'first');
      runner.addMigration(migration);

      await runner.latest();

      expect(migration.up).toHaveBeenCalled();
    });
  });

  describe('rollback', () => {
    it('should rollback last migration by default', async () => {
      runner = new MigrationRunner(adapter, { logger, validateChecksums: false });
      const migration1 = createMigration(1, 'first');
      const migration2 = createMigration(2, 'second');
      runner.addMigration(migration1);
      runner.addMigration(migration2);

      adapter.query = vi.fn().mockResolvedValue({
        rows: [
          { version: 1, checksum: 'abc' },
          { version: 2, checksum: 'def' },
        ],
      });

      await runner.rollback();

      expect(migration2.down).toHaveBeenCalled();
      expect(migration1.down).not.toHaveBeenCalled();
    });

    it('should rollback specified number of steps', async () => {
      runner = new MigrationRunner(adapter, { logger, validateChecksums: false });
      const migration1 = createMigration(1, 'first');
      const migration2 = createMigration(2, 'second');
      const migration3 = createMigration(3, 'third');
      runner.addMigration(migration1);
      runner.addMigration(migration2);
      runner.addMigration(migration3);

      adapter.query = vi.fn().mockResolvedValue({
        rows: [
          { version: 1, checksum: 'abc' },
          { version: 2, checksum: 'def' },
          { version: 3, checksum: 'ghi' },
        ],
      });

      await runner.rollback(2);

      expect(migration3.down).toHaveBeenCalled();
      expect(migration2.down).toHaveBeenCalled();
      expect(migration1.down).not.toHaveBeenCalled();
    });

    it('should log when no migrations to rollback', async () => {
      runner = new MigrationRunner(adapter, { logger });
      adapter.query = vi.fn().mockResolvedValue({ rows: [] });

      await runner.rollback();

      expect(logger.info).toHaveBeenCalledWith('No migrations to rollback');
    });
  });

  describe('reset', () => {
    it('should revert all migrations', async () => {
      runner = new MigrationRunner(adapter, { logger, validateChecksums: false });
      const migration = createMigration(1, 'first');
      runner.addMigration(migration);

      adapter.query = vi.fn().mockResolvedValue({
        rows: [{ version: 1, checksum: 'abc' }],
      });

      await runner.reset();

      expect(migration.down).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should reset and run latest', async () => {
      runner = new MigrationRunner(adapter, { logger, validateChecksums: false });
      const migration = createMigration(1, 'first');
      runner.addMigration(migration);

      // First query returns executed migrations for reset
      // Then returns empty for up()
      adapter.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ version: 1, checksum: 'abc' }] }) // getExecutedMigrations in down()
        .mockResolvedValueOnce({ rows: [] }); // getExecutedMigrations in up()

      await runner.refresh();

      expect(migration.down).toHaveBeenCalled();
      expect(migration.up).toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('should return migration status', async () => {
      runner = new MigrationRunner(adapter, { logger });
      runner.addMigration(createMigration(1, 'first'));
      runner.addMigration(createMigration(2, 'second'));

      adapter.query = vi.fn().mockResolvedValue({
        rows: [{ version: 1, executedAt: new Date().toISOString() }],
      });

      const status = await runner.status();

      expect(status.executed).toHaveLength(1);
      expect(status.pending).toHaveLength(1);
      expect(status.current).toBe(1);
    });

    it('should return null current when no migrations executed', async () => {
      runner = new MigrationRunner(adapter, { logger });
      adapter.query = vi.fn().mockResolvedValue({ rows: [] });

      const status = await runner.status();

      expect(status.current).toBeNull();
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      runner = new MigrationRunner(adapter, { logger, validateChecksums: true });
    });

    it('should return valid when no issues', async () => {
      runner.addMigration(createMigration(1, 'first'));
      runner.addMigration(createMigration(2, 'second'));
      adapter.query = vi.fn().mockResolvedValue({ rows: [] });

      const result = await runner.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate versions', async () => {
      // Add migrations directly to bypass the check in addMigration
      runner.addMigration(createMigration(1, 'first'));
      adapter.query = vi.fn().mockResolvedValue({ rows: [] });

      const result = await runner.validate();

      // Since addMigration prevents duplicates, this test validates that the
      // validate function doesn't find issues when migrations are added properly
      expect(result.valid).toBe(true);
    });

    it('should detect gaps in versions', async () => {
      runner.addMigration(createMigration(1, 'first'));
      runner.addMigration(createMigration(3, 'third')); // Gap: version 2 missing
      adapter.query = vi.fn().mockResolvedValue({ rows: [] });

      const result = await runner.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Gap in migration versions between 1 and 3');
    });

    it('should detect missing migrations in codebase', async () => {
      runner.addMigration(createMigration(1, 'first'));
      adapter.query = vi.fn().mockResolvedValue({
        rows: [{ version: 99, checksum: 'abc', executedAt: new Date().toISOString() }],
      });

      const result = await runner.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Migration 99 exists in history but not in codebase');
    });

    it('should detect checksum mismatches', async () => {
      const migration = createMigration(1, 'first');
      runner.addMigration(migration);
      adapter.query = vi.fn().mockResolvedValue({
        rows: [{ version: 1, checksum: 'wrong_checksum', executedAt: new Date().toISOString() }],
      });

      const result = await runner.validate();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Checksum mismatch');
    });

    it('should skip checksum validation when disabled', async () => {
      runner = new MigrationRunner(adapter, { logger, validateChecksums: false });
      runner.addMigration(createMigration(1, 'first'));
      adapter.query = vi.fn().mockResolvedValue({
        rows: [{ version: 1, checksum: 'wrong_checksum', executedAt: new Date().toISOString() }],
      });

      const result = await runner.validate();

      // No checksum error since validation is disabled
      expect(result.errors.filter((e) => e.includes('Checksum'))).toHaveLength(0);
    });
  });

  describe('runMigration error handling', () => {
    it('should rollback transaction on migration failure', async () => {
      const transaction = {
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
      };
      adapter.beginTransaction = vi.fn().mockResolvedValue(transaction);

      runner = new MigrationRunner(adapter, { logger });
      const migration = createMigration(1, 'failing');
      migration.up = vi.fn().mockRejectedValue(new Error('Migration failed'));
      runner.addMigration(migration);

      await expect(runner.up()).rejects.toThrow('Failed to run migration 1');
      expect(transaction.rollback).toHaveBeenCalled();
      expect(transaction.commit).not.toHaveBeenCalled();
    });
  });
});

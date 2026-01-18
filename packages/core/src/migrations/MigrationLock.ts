/**
 * Migration Lock
 * Prevents concurrent migration execution
 */

import { hostname } from 'node:os';

import { MySQLDialect } from '../schema/dialects/MySQLDialect';
import { PostgreSQLDialect } from '../schema/dialects/PostgreSQLDialect';

import type { DatabaseAdapter } from '../interfaces';
import type { SchemaDialect } from '../schema/types';

export interface MigrationLockOptions {
  tableName?: string;
  timeout?: number;
  dialect: 'mysql' | 'postgresql';
}

export class MigrationLock {
  private adapter: DatabaseAdapter;
  private tableName: string;
  private timeout: number;
  private dialect: SchemaDialect;
  private lockId: string;
  private isLocked: boolean = false;

  constructor(adapter: DatabaseAdapter, options: MigrationLockOptions) {
    this.adapter = adapter;
    this.tableName = options.tableName ?? 'db_migrations_lock';
    this.timeout = options.timeout ?? 60000; // 60 seconds
    this.lockId = `${hostname()}_${process.pid}_${Date.now()}`;

    this.dialect = options.dialect === 'mysql' ? new MySQLDialect() : new PostgreSQLDialect();
  }

  /**
   * Initialize the lock table
   */
  async initialize(): Promise<void> {
    const tableName = this.dialect.quoteIdentifier(this.tableName);

    if (this.dialect.dialect === 'mysql') {
      await this.adapter.execute(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id INT PRIMARY KEY,
          is_locked TINYINT NOT NULL DEFAULT 0,
          locked_at TIMESTAMP NULL,
          locked_by VARCHAR(255) NULL
        ) ENGINE=InnoDB
      `);
    } else {
      await this.adapter.execute(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id INT PRIMARY KEY,
          is_locked BOOLEAN NOT NULL DEFAULT FALSE,
          locked_at TIMESTAMP NULL,
          locked_by VARCHAR(255) NULL
        )
      `);
    }

    // Insert initial row if not exists
    const checkSql =
      this.dialect.dialect === 'mysql'
        ? `SELECT 1 FROM ${tableName} WHERE id = 1`
        : `SELECT 1 FROM ${tableName} WHERE id = 1`;

    const result = await this.adapter.query(checkSql);

    if (result.rows.length === 0) {
      if (this.dialect.dialect === 'mysql') {
        await this.adapter.execute(`INSERT INTO ${tableName} (id, is_locked) VALUES (1, 0)`);
      } else {
        await this.adapter.execute(`INSERT INTO ${tableName} (id, is_locked) VALUES (1, FALSE)`);
      }
    }
  }

  /**
   * Acquire the migration lock
   */
  async acquire(): Promise<boolean> {
    const tableName = this.dialect.quoteIdentifier(this.tableName);
    const startTime = Date.now();

    while (Date.now() - startTime < this.timeout) {
      try {
        // Try to acquire lock with atomic update
        if (this.dialect.dialect === 'mysql') {
          const result = await this.adapter.execute(
            `
            UPDATE ${tableName}
            SET is_locked = 1,
                locked_at = NOW(),
                locked_by = ?
            WHERE id = 1 AND is_locked = 0
          `,
            [this.lockId],
          );

          if ((result.affectedRows ?? 0) > 0) {
            this.isLocked = true;
            return true;
          }
        } else {
          const result = await this.adapter.execute(
            `
            UPDATE ${tableName}
            SET is_locked = TRUE,
                locked_at = NOW(),
                locked_by = $1
            WHERE id = 1 AND is_locked = FALSE
            RETURNING id
          `,
            [this.lockId],
          );

          if (result.rows.length > 0) {
            this.isLocked = true;
            return true;
          }
        }

        // Check if lock is stale (held for more than timeout)
        const staleResult = await this.adapter.query<{
          locked_at: Date;
          locked_by: string;
        }>(`SELECT locked_at, locked_by FROM ${tableName} WHERE id = 1`);

        if (staleResult.rows.length > 0) {
          const lockedAt = staleResult.rows[0]!.locked_at;
          if (lockedAt && Date.now() - new Date(lockedAt).getTime() > this.timeout) {
            // Force release stale lock
            console.warn(
              `Releasing stale migration lock held by ${staleResult.rows[0]!.locked_by}`,
            );
            await this.forceRelease();
            continue;
          }
        }

        // Wait before retrying
        await this.sleep(1000);
      } catch (error) {
        console.error('Error acquiring migration lock:', error);
        throw error;
      }
    }

    return false;
  }

  /**
   * Release the migration lock
   */
  async release(): Promise<void> {
    if (!this.isLocked) {
      return;
    }

    const tableName = this.dialect.quoteIdentifier(this.tableName);

    try {
      if (this.dialect.dialect === 'mysql') {
        await this.adapter.execute(
          `
          UPDATE ${tableName}
          SET is_locked = 0,
              locked_at = NULL,
              locked_by = NULL
          WHERE id = 1 AND locked_by = ?
        `,
          [this.lockId],
        );
      } else {
        await this.adapter.execute(
          `
          UPDATE ${tableName}
          SET is_locked = FALSE,
              locked_at = NULL,
              locked_by = NULL
          WHERE id = 1 AND locked_by = $1
        `,
          [this.lockId],
        );
      }

      this.isLocked = false;
    } catch (error) {
      console.error('Error releasing migration lock:', error);
      throw error;
    }
  }

  /**
   * Force release the lock (for stale locks)
   */
  async forceRelease(): Promise<void> {
    const tableName = this.dialect.quoteIdentifier(this.tableName);

    if (this.dialect.dialect === 'mysql') {
      await this.adapter.execute(`
        UPDATE ${tableName}
        SET is_locked = 0,
            locked_at = NULL,
            locked_by = NULL
        WHERE id = 1
      `);
    } else {
      await this.adapter.execute(`
        UPDATE ${tableName}
        SET is_locked = FALSE,
            locked_at = NULL,
            locked_by = NULL
        WHERE id = 1
      `);
    }

    this.isLocked = false;
  }

  /**
   * Check if lock is currently held
   */
  async isHeld(): Promise<boolean> {
    const tableName = this.dialect.quoteIdentifier(this.tableName);
    const result = await this.adapter.query<{ is_locked: number | boolean }>(
      `SELECT is_locked FROM ${tableName} WHERE id = 1`,
    );

    if (result.rows.length === 0) {
      return false;
    }

    const isLocked = result.rows[0]!.is_locked;
    return isLocked === 1 || isLocked === true;
  }

  /**
   * Get lock info
   */
  async getLockInfo(): Promise<{
    isLocked: boolean;
    lockedAt: Date | null;
    lockedBy: string | null;
  }> {
    const tableName = this.dialect.quoteIdentifier(this.tableName);
    const result = await this.adapter.query<{
      is_locked: number | boolean;
      locked_at: Date | null;
      locked_by: string | null;
    }>(`SELECT is_locked, locked_at, locked_by FROM ${tableName} WHERE id = 1`);

    if (result.rows.length === 0) {
      return { isLocked: false, lockedAt: null, lockedBy: null };
    }

    const row = result.rows[0]!;
    return {
      isLocked: row.is_locked === 1 || row.is_locked === true,
      lockedAt: row.locked_at,
      lockedBy: row.locked_by,
    };
  }

  /**
   * Execute a function with lock
   */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const acquired = await this.acquire();
    if (!acquired) {
      throw new Error(
        `Could not acquire migration lock within ${this.timeout}ms. Another migration may be running.`,
      );
    }

    try {
      return await fn();
    } finally {
      await this.release();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * CLI Utilities
 * Helper functions for CLI commands
 */

import { resolve } from 'node:path';

import { loadConfig, type DBBridgeConfig } from './config';
import { FileMigrationRunner } from '../migrations/FileMigrationRunner';

import type { DatabaseAdapter } from '../interfaces';

/**
 * Create adapter from config
 * Dynamically imports the appropriate adapter package
 */
export async function createAdapterFromConfig(config: DBBridgeConfig): Promise<DatabaseAdapter> {
  const { dialect, host, port, user, password, database, ssl } = config.connection;

  if (dialect === 'mysql') {
    try {
      const { MySQLAdapter } = await import('@db-bridge/mysql');
      const adapter = new MySQLAdapter() as DatabaseAdapter;
      await adapter.connect({
        host,
        port,
        user,
        password,
        database,
      });
      return adapter;
    } catch (error) {
      if ((error as Error).message.includes('Cannot find module')) {
        throw new Error(
          'MySQL adapter not found. Install it with: npm install @db-bridge/mysql mysql2',
        );
      }
      throw error;
    }
  }

  if (dialect === 'postgresql') {
    try {
      const { PostgreSQLAdapter } = await import('@db-bridge/postgresql');
      const adapter = new PostgreSQLAdapter() as DatabaseAdapter;
      await adapter.connect({
        host,
        port,
        user,
        password,
        database,
        ssl: ssl as boolean | undefined,
      });
      return adapter;
    } catch (error) {
      if ((error as Error).message.includes('Cannot find module')) {
        throw new Error(
          'PostgreSQL adapter not found. Install it with: npm install @db-bridge/postgresql pg',
        );
      }
      throw error;
    }
  }

  throw new Error(`Unsupported dialect: ${dialect}`);
}

/**
 * Create migration runner from config
 */
export async function createRunnerFromConfig(
  options: { dryRun?: boolean } = {},
): Promise<{ runner: FileMigrationRunner; adapter: DatabaseAdapter; config: DBBridgeConfig }> {
  const config = await loadConfig();
  const adapter = await createAdapterFromConfig(config);

  const runner = new FileMigrationRunner(adapter, {
    directory: resolve(process.cwd(), config.migrations?.directory || './src/migrations'),
    tableName: config.migrations?.tableName,
    lockTableName: config.migrations?.lockTableName,
    dialect: config.connection.dialect,
    dryRun: options.dryRun,
  });

  return { runner, adapter, config };
}

/**
 * Format table for console output
 */
export function formatTable(headers: string[], rows: string[][]): string {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map((r) => (r[i] || '').length));
    return Math.max(h.length, maxRow);
  });

  // Create separator
  const separator = '─'.repeat(widths.reduce((a, b) => a + b + 3, 1));

  // Format header
  const headerRow = headers.map((h, i) => h.padEnd(widths[i]!)).join(' │ ');

  // Format rows
  const dataRows = rows
    .map((row) => row.map((cell, i) => (cell || '').padEnd(widths[i]!)).join(' │ '))
    .join('\n');

  return `┌${separator}┐\n│ ${headerRow} │\n├${separator}┤\n${
    dataRows
      ? dataRows
          .split('\n')
          .map((r) => `│ ${r} │`)
          .join('\n')
      : `│${' '.repeat(separator.length)}│`
  }\n└${separator}┘`;
}

/**
 * Print success message
 */
export function success(message: string): void {
  console.log(`✓ ${message}`);
}

/**
 * Print error message
 */
export function error(message: string): void {
  console.error(`✗ ${message}`);
}

/**
 * Print info message
 */
export function info(message: string): void {
  console.log(`ℹ ${message}`);
}

/**
 * Print warning message
 */
export function warn(message: string): void {
  console.warn(`⚠ ${message}`);
}

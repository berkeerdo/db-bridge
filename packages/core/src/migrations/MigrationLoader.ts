/**
 * Migration Loader
 * Loads migration files from a directory
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Migration, MigrationFile } from './types';

/**
 * Migration filename pattern
 * Format: YYYYMMDDHHMMSS_description.ts
 * Example: 20250118120000_create_users_table.ts
 */
const MIGRATION_PATTERN = /^(\d{14})_(.+)\.(ts|js|mjs)$/;

export class MigrationLoader {
  private directory: string;
  private extensions: string[];

  constructor(directory: string, extensions: string[] = ['.ts', '.js', '.mjs']) {
    this.directory = directory;
    this.extensions = extensions;
  }

  /**
   * Scan directory for migration files
   */
  async scanDirectory(): Promise<MigrationFile[]> {
    const files: MigrationFile[] = [];

    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- directory is user-configured
      const entries = await readdir(this.directory, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        const ext = extname(entry.name);
        if (!this.extensions.includes(ext)) {
          continue;
        }

        const match = entry.name.match(MIGRATION_PATTERN);
        if (!match) {
          continue;
        }

        const [, timestamp, description] = match;
        files.push({
          name: basename(entry.name, ext),
          path: join(this.directory, entry.name),
          timestamp: timestamp!,
          description: description!.replaceAll('_', ' '),
        });
      }

      // Sort by timestamp
      files.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      return files;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Migration directory not found: ${this.directory}`);
      }
      throw error;
    }
  }

  /**
   * Load a single migration file
   */
  async loadMigration(file: MigrationFile): Promise<Migration> {
    try {
      // Convert path to file URL for ESM import
      const fileUrl = pathToFileURL(file.path).href;
      const module = await import(fileUrl);

      // Support both default export and named exports
      const migration = module.default || module;

      // Validate migration structure
      if (typeof migration.up !== 'function') {
        throw new TypeError(`Migration ${file.name} is missing 'up' function`);
      }
      if (typeof migration.down !== 'function') {
        throw new TypeError(`Migration ${file.name} is missing 'down' function`);
      }

      return {
        name: file.name,
        up: migration.up,
        down: migration.down,
        transactional: migration.transactional ?? true,
        phase: migration.phase,
      };
    } catch (error) {
      throw new Error(`Failed to load migration ${file.name}: ${(error as Error).message}`);
    }
  }

  /**
   * Load all migrations from directory
   */
  async loadAll(): Promise<Migration[]> {
    const files = await this.scanDirectory();
    const migrations: Migration[] = [];

    for (const file of files) {
      const migration = await this.loadMigration(file);
      migrations.push(migration);
    }

    return migrations;
  }

  /**
   * Get migration files (metadata only, without loading)
   */
  async getMigrationFiles(): Promise<MigrationFile[]> {
    return this.scanDirectory();
  }

  /**
   * Calculate checksum for a migration file
   */
  async calculateChecksum(file: MigrationFile): Promise<string> {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from scanned directory
    const content = await readFile(file.path, 'utf8');
    // Normalize line endings and trim whitespace for consistent checksums
    const normalized = content.replaceAll('\r\n', '\n').trim();
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  /**
   * Calculate checksums for all migration files
   */
  async calculateAllChecksums(): Promise<Map<string, string>> {
    const files = await this.scanDirectory();
    const checksums = new Map<string, string>();

    for (const file of files) {
      const checksum = await this.calculateChecksum(file);
      checksums.set(file.name, checksum);
    }

    return checksums;
  }

  /**
   * Generate a new migration filename
   */
  static generateFilename(description: string): string {
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');

    const sanitizedDescription = description
      .toLowerCase()
      .replaceAll(/[^\da-z]+/g, '_')
      .replaceAll(/^_+|_+$/g, '');

    return `${timestamp}_${sanitizedDescription}.ts`;
  }

  /**
   * Get migration template content
   */
  static getMigrationTemplate(name: string): string {
    return `/**
 * Migration: ${name}
 * Created at: ${new Date().toISOString()}
 */

import type { SchemaBuilder } from '@db-bridge/core';

export default {
  name: '${name}',

  async up(schema: SchemaBuilder): Promise<void> {
    // Write your migration here
    // Example:
    // await schema.createTable('users', (table) => {
    //   table.increments('id');
    //   table.string('email', 255).unique().notNull();
    //   table.timestamps();
    // });
  },

  async down(schema: SchemaBuilder): Promise<void> {
    // Reverse the migration
    // Example:
    // await schema.dropTableIfExists('users');
  },
};
`;
  }
}

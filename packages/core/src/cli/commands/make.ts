/**
 * migrate:make Command
 * Create a new migration file
 */

import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { MigrationLoader } from '../../migrations/MigrationLoader';
import { loadConfig } from '../config';
import { success, error } from '../utils';

export async function makeCommand(name: string): Promise<void> {
  try {
    // Load config to get migrations directory
    const config = await loadConfig();
    const directory = resolve(process.cwd(), config.migrations?.directory || './src/migrations');

    // Ensure directory exists
    if (!existsSync(directory)) {
      await mkdir(directory, { recursive: true });
      console.log(`Created migrations directory: ${directory}`);
    }

    // Generate filename and content
    const filename = MigrationLoader.generateFilename(name);
    const filepath = resolve(directory, filename);
    const migrationName = filename.replace(/\.(ts|js|mjs)$/, '');
    const content = MigrationLoader.getMigrationTemplate(migrationName);

    // Check if file already exists
    if (existsSync(filepath)) {
      error(`Migration file already exists: ${filepath}`);
      process.exit(1);
    }

    // Write file
    await writeFile(filepath, content, 'utf8');
    success(`Created migration: ${filename}`);
    console.log(`  Path: ${filepath}`);
  } catch (error_) {
    error((error_ as Error).message);
    process.exit(1);
  }
}

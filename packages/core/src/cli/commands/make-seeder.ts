/**
 * make:seeder Command
 * Create a new seeder file
 */

import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { SeederLoader } from '../../seeds/SeederLoader';
import { loadConfig } from '../config';
import { success, error } from '../utils';

export async function makeSeederCommand(name: string): Promise<void> {
  try {
    // Load config to get seeds directory
    const config = await loadConfig();
    const directory = resolve(process.cwd(), config.seeds?.directory || './src/seeds');

    // Ensure directory exists
    if (!existsSync(directory)) {
      await mkdir(directory, { recursive: true });
      console.log(`Created seeds directory: ${directory}`);
    }

    // Generate filename and content
    const prefix = config.seeds?.prefix;
    const filename = SeederLoader.generateFilename(name, prefix);
    const filepath = resolve(directory, filename);
    const seederName = filename.replace(/\.(ts|js|mjs)$/, '');
    const content = SeederLoader.getSeederTemplate(seederName);

    // Check if file already exists
    if (existsSync(filepath)) {
      error(`Seeder file already exists: ${filepath}`);
      process.exit(1);
    }

    // Write file
    await writeFile(filepath, content, 'utf8');
    success(`Created seeder: ${filename}`);
    console.log(`  Path: ${filepath}`);
  } catch (error_) {
    error((error_ as Error).message);
    process.exit(1);
  }
}

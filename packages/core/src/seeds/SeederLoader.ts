/**
 * Seeder Loader
 * Load seeder files from directory
 */

import { readdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Seeder, SeederFile } from './types';

export class SeederLoader {
  constructor(private readonly directory: string) {}

  /**
   * Load all seeder files from directory
   */
  async loadAll(): Promise<SeederFile[]> {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- directory is user-configured
    const files = await readdir(this.directory);

    const seederFiles = files
      .filter((f) => /\.(ts|js|mjs)$/.test(f) && !f.endsWith('.d.ts'))
      .sort() // Alphabetical order
      .map((f) => ({
        name: this.getSeederName(f),
        path: resolve(this.directory, f),
      }));

    return seederFiles;
  }

  /**
   * Load a specific seeder by path
   */
  async load(seederPath: string): Promise<Seeder> {
    const fileUrl = pathToFileURL(seederPath).href;
    const module = await import(fileUrl);
    const seeder = module.default || module;

    if (!seeder || typeof seeder.run !== 'function') {
      throw new Error(`Invalid seeder: ${seederPath} - must export a run() function`);
    }

    return seeder;
  }

  /**
   * Get seeder name from filename
   */
  private getSeederName(filename: string): string {
    return basename(filename).replace(/\.(ts|js|mjs)$/, '');
  }

  /**
   * Generate a new seeder filename
   * @param name - Seeder name
   * @param prefix - Optional prefix (e.g., 'auth' -> auth_users_seeder.ts)
   */
  static generateFilename(name: string, prefix?: string): string {
    // Convert to snake_case
    const snakeName = name
      .replaceAll(/([a-z])([A-Z])/g, '$1_$2')
      .replaceAll(/[\s-]+/g, '_')
      .toLowerCase();

    const sanitizedPrefix = prefix
      ? prefix
          .toLowerCase()
          .replaceAll(/[^\da-z]+/g, '_')
          .replaceAll(/^_+|_+$/g, '')
      : null;

    return sanitizedPrefix ? `${sanitizedPrefix}_${snakeName}_seeder.ts` : `${snakeName}_seeder.ts`;
  }

  /**
   * Get seeder template
   */
  static getSeederTemplate(name: string): string {
    const className = name
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');

    return `/**
 * ${className} Seeder
 */

import type { Seeder, DatabaseAdapter } from '@db-bridge/core';

export default {
  async run(adapter: DatabaseAdapter): Promise<void> {
    // Insert seed data
    // await adapter.execute(\`
    //   INSERT INTO users (name, email) VALUES
    //   ('John Doe', 'john@example.com'),
    //   ('Jane Doe', 'jane@example.com')
    // \`);
  },
} satisfies Seeder;
`;
  }
}

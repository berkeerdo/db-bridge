/**
 * Seeder Loader
 * Load seeder files from directory with priority/dependency ordering
 */

import { readdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Seeder, SeederFile } from './types';

const DEFAULT_PRIORITY = 100;

export class SeederLoader {
  constructor(private readonly directory: string) {}

  /**
   * Load all seeder files from directory (sorted by priority/dependencies)
   */
  async loadAll(): Promise<SeederFile[]> {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- directory is user-configured
    const files = await readdir(this.directory);

    const seederPaths = files
      .filter((f) => /\.(ts|js|mjs)$/.test(f) && !f.endsWith('.d.ts'))
      .map((f) => ({
        name: this.getSeederName(f),
        path: resolve(this.directory, f),
      }));

    // Load all seeders to get their priority and depends
    const seederFiles: SeederFile[] = [];
    for (const file of seederPaths) {
      const seeder = await this.load(file.path);
      seederFiles.push({
        name: file.name,
        path: file.path,
        priority: seeder.priority ?? DEFAULT_PRIORITY,
        depends: seeder.depends,
      });
    }

    // Sort by dependencies first, then by priority
    return this.sortByDependencies(seederFiles);
  }

  /**
   * Sort seeders by dependencies (topological sort) then by priority
   */
  private sortByDependencies(files: SeederFile[]): SeederFile[] {
    const fileMap = new Map(files.map((f) => [f.name, f]));
    const visited = new Set<string>();
    const result: SeederFile[] = [];

    const visit = (file: SeederFile): void => {
      if (visited.has(file.name)) {
        return;
      }
      visited.add(file.name);

      // Visit dependencies first
      if (file.depends) {
        for (const dep of file.depends) {
          const depFile = fileMap.get(dep) || fileMap.get(`${dep}_seeder`);
          if (depFile) {
            visit(depFile);
          }
        }
      }

      result.push(file);
    };

    // Sort by priority first, then visit
    const sortedByPriority = [...files].sort(
      (a, b) => (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY),
    );

    for (const file of sortedByPriority) {
      visit(file);
    }

    return result;
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
  // Priority: lower runs first (default: 100)
  // priority: 10,

  // Dependencies: seeders that must run before this one
  // depends: ['users'],

  async run(adapter: DatabaseAdapter): Promise<void> {
    // Insert seed data
    // await adapter.execute(\`
    //   INSERT INTO ${name} (name, email) VALUES
    //   ('John Doe', 'john@example.com'),
    //   ('Jane Doe', 'jane@example.com')
    // \`);
  },
} satisfies Seeder;
`;
  }
}

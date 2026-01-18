/**
 * Seeder Runner
 * Execute seeders
 */

import { SeederLoader } from './SeederLoader';

import type { DatabaseAdapter } from '../interfaces';
import type { SeederRunnerOptions, SeederFile } from './types';

export interface SeederResult {
  name: string;
  success: boolean;
  error?: string;
  duration: number;
}

export class SeederRunner {
  private readonly loader: SeederLoader;
  private readonly options: SeederRunnerOptions;

  constructor(
    private readonly adapter: DatabaseAdapter,
    options: SeederRunnerOptions,
  ) {
    this.options = options;
    this.loader = new SeederLoader(options.directory);
  }

  /**
   * Run all seeders (or filtered by options)
   */
  async run(): Promise<SeederResult[]> {
    const files = await this.loader.loadAll();
    const filteredFiles = this.filterSeeders(files);
    const results: SeederResult[] = [];

    for (const file of filteredFiles) {
      const startTime = Date.now();

      try {
        const seeder = await this.loader.load(file.path);
        await seeder.run(this.adapter);

        results.push({
          name: file.name,
          success: true,
          duration: Date.now() - startTime,
        });
      } catch (error) {
        results.push({
          name: file.name,
          success: false,
          error: (error as Error).message,
          duration: Date.now() - startTime,
        });

        // Stop on first error
        break;
      }
    }

    return results;
  }

  /**
   * Run a specific seeder by name
   */
  async runSeeder(name: string): Promise<SeederResult> {
    const files = await this.loader.loadAll();
    const file = files.find((f) => f.name === name || f.name === `${name}_seeder`);

    if (!file) {
      return {
        name,
        success: false,
        error: `Seeder not found: ${name}`,
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      const seeder = await this.loader.load(file.path);
      await seeder.run(this.adapter);

      return {
        name: file.name,
        success: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: file.name,
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Filter seeders based on options
   */
  private filterSeeders(files: SeederFile[]): SeederFile[] {
    let filtered = files;

    // Filter by 'only' option
    if (this.options.only && this.options.only.length > 0) {
      filtered = filtered.filter((f) =>
        this.options.only!.some((name) => f.name === name || f.name === `${name}_seeder`),
      );
    }

    // Filter by 'except' option
    if (this.options.except && this.options.except.length > 0) {
      filtered = filtered.filter(
        (f) => !this.options.except!.some((name) => f.name === name || f.name === `${name}_seeder`),
      );
    }

    return filtered;
  }

  /**
   * List all available seeders
   */
  async list(): Promise<SeederFile[]> {
    return this.loader.loadAll();
  }
}

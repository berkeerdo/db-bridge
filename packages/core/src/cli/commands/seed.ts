/**
 * db:seed Command
 * Run database seeders
 */

import { resolve } from 'node:path';

import { SeederRunner } from '../../seeds/SeederRunner';
import { loadConfig } from '../config';
import { createAdapterFromConfig, success, error, info } from '../utils';

export interface SeedOptions {
  /** Specific seeder to run */
  class?: string;
}

export async function seedCommand(options: SeedOptions = {}): Promise<void> {
  let adapter;

  try {
    const config = await loadConfig();
    adapter = await createAdapterFromConfig(config);

    const directory = resolve(process.cwd(), config.seeds?.directory || './src/seeds');

    const runner = new SeederRunner(adapter, { directory });

    if (options.class) {
      // Run specific seeder
      info(`Running seeder: ${options.class}`);
      const result = await runner.runSeeder(options.class);

      if (result.success) {
        success(`Seeder completed: ${result.name} (${result.duration}ms)`);
      } else {
        error(`Seeder failed: ${result.error}`);
        process.exit(1);
      }
    } else {
      // Run all seeders
      info('Running all seeders...');
      console.log('');

      const results = await runner.run();

      if (results.length === 0) {
        info('No seeders found');
        return;
      }

      let hasErrors = false;
      for (const result of results) {
        if (result.success) {
          success(`${result.name} (${result.duration}ms)`);
        } else {
          error(`${result.name}: ${result.error}`);
          hasErrors = true;
        }
      }

      console.log('');
      if (hasErrors) {
        error('Seeding completed with errors');
        process.exit(1);
      } else {
        success(`Seeding complete - ran ${results.length} seeder(s)`);
      }
    }
  } catch (error_) {
    error((error_ as Error).message);
    process.exit(1);
  } finally {
    if (adapter) {
      await adapter.disconnect();
    }
  }
}

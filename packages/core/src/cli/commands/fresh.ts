/**
 * migrate:fresh Command
 * Drop all tables and re-run migrations
 */

import { createRunnerFromConfig, success, info, error, warn } from '../utils';

export interface FreshOptions {
  dryRun?: boolean;
}

export async function freshCommand(options: FreshOptions = {}): Promise<void> {
  let adapter;

  try {
    if (options.dryRun) {
      info('DRY RUN MODE - No changes will be made');
    } else {
      warn('This will reset ALL migrations and re-run them!');
    }

    const { runner, adapter: a } = await createRunnerFromConfig(options);
    adapter = a;

    console.log('');
    info('Resetting all migrations...');

    const executed = await runner.fresh();

    if (executed.length === 0) {
      info('No migrations to run');
    } else {
      console.log('');
      success(`Fresh migration complete - ran ${executed.length} migration(s):`);
      for (const name of executed) {
        console.log(`  - ${name}`);
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

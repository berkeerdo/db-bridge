/**
 * migrate:latest Command
 * Run all pending migrations
 */

import { createRunnerFromConfig, success, info, error } from '../utils';

export interface LatestOptions {
  dryRun?: boolean;
}

export async function latestCommand(options: LatestOptions = {}): Promise<void> {
  let adapter;

  try {
    if (options.dryRun) {
      info('DRY RUN MODE - No changes will be made');
    }

    const { runner, adapter: a } = await createRunnerFromConfig(options);
    adapter = a;

    const executed = await runner.latest();

    if (executed.length === 0) {
      info('Nothing to migrate');
    } else {
      console.log('');
      success(`Ran ${executed.length} migration(s):`);
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

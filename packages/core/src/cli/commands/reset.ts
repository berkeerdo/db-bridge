/**
 * migrate:reset Command
 * Rollback all migrations
 */

import { createRunnerFromConfig, success, info, error, warn } from '../utils';

export interface ResetOptions {
  dryRun?: boolean;
}

export async function resetCommand(options: ResetOptions = {}): Promise<void> {
  let adapter;

  try {
    if (options.dryRun) {
      info('DRY RUN MODE - No changes will be made');
    } else {
      warn('This will rollback ALL migrations!');
    }

    const { runner, adapter: a } = await createRunnerFromConfig(options);
    adapter = a;

    const rolledBack = await runner.reset();

    if (rolledBack.length === 0) {
      info('Nothing to reset');
    } else {
      console.log('');
      success(`Reset ${rolledBack.length} migration(s):`);
      for (const name of rolledBack) {
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
